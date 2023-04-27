import { clipboard } from '..';
import {
	genericMeta,
	getUserId,
	thumbnailName,
	folderSizesMutationUpdates,
	throwErr,
} from '../utils';
import { v4 as uuidv4 } from 'uuid';
import { graphQLClient } from '../endpoint.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import s3 from '../s3.js';
import { getRecords } from '../getRecordsMiddleware';
import { Records } from '../Records';
import { gql } from 'graphql-request';

const { S3_BUCKET } = process.env;

const paste = async (req, res) => {
	const userId = getUserId({ req });
	const { folderId } = req.body;
	const { records } = res.locals;

	if (!clipboard[userId]) {
		return res.status(400).json({ message: 'cannot complete paste' });
	}

	const { selectedFolders, selectedFiles, type } = clipboard[userId];
	let graphqlResponse;

	const cutCopyRecords = await getRecords({ selectedFolders, selectedFiles });
	const folderIdsAndSizes = cutCopyRecords.getFolderIdsAndSizes();
	const totalSize = Object.values(folderIdsAndSizes).reduce(
		(previousValue, currentValue) => previousValue + currentValue,
		0
	);

	if (type === 'cut') {
		delete clipboard[userId];

		let args, response;

		const idsOfFolderPathPastingInto = records
			.getFolderPath(folderId)
			.map((record) => record.id);
		// Check if an array contains any element of another array
		const found = selectedFolders.some((el) =>
			idsOfFolderPathPastingInto.includes(el)
		);
		if (found) {
			throw throwErr(
				'The destination folder is a subfolder of the source folder'
			);
		}

		const folderArgs = {
			where: {
				id: { _in: selectedFolders },
			},
			_set: {
				folderId,
			},
		};

		const fileArgs = {
			where: {
				id: { _in: selectedFiles },
			},
			_set: {
				folderId,
			},
		};

		const folderSizes = Object.entries(folderIdsAndSizes).map(([id, size]) => ({
			id,
			inc: false,
			size,
		}));

		const _mergeRecords = (records1, records2) => {
			const data = {};
			Object.keys(records1.data).forEach((key) => {
				data[key] = { ...records1.data[key], ...records2.data[key] };
			});
			return new Records(data);
		};

		const newRecords = _mergeRecords(cutCopyRecords, records);

		const folderSizesUpdates = await folderSizesMutationUpdates(newRecords, [
			...folderSizes,
			{
				id: folderId,
				inc: true,
				size: totalSize,
			},
		]);

		const folderManyArgs = {
			updates: [...folderSizesUpdates, folderArgs],
		};

		const mutation = gql`
				mutation {
					updateFolderMany(${objectToGraphqlArgs(folderManyArgs)}) {
						affected_rows
					}
					updateFile(${objectToGraphqlArgs(fileArgs)}) {
						returning {
							id
							meta {
								id
							}
						}
					}
				}
			`;

		response = await graphQLClient.request(mutation);
	} else {
		// copy selected folders

		const selectedFoldersQueryArguments = {
			where: {
				_and: [
					{ id: { _in: selectedFolders } },
					{ deletedInRootToUserId: { _isNull: true } },
				],
			},
		};
		const selectedFoldersQuery = gql`
			query {
				folder(${objectToGraphqlArgs(selectedFoldersQueryArguments)}) {
					id
					name
				}
			}
		`;
		graphqlResponse = await graphQLClient.request(selectedFoldersQuery);

		for (const folder of graphqlResponse.folder) {
			const { id } = await copyFolder({
				folder,
				folderId,
				userId,
				records,
			});

			await recursiveFolderCopy({
				folderIdToCopy: folder.id,
				folderIdToCreateIn: id,
				userId,
				totalSize,
				records,
				initialize: res.locals.initialize,
			});
		}

		// copy selected Files
		const selectedFilesQueryArguments = {
			where: {
				_and: [
					{ id: { _in: selectedFiles } },
					{ deletedInRootToUserId: { _isNull: true } },
				],
			},
		};
		const selectedFilesQuery = gql`
			query {
				file(${objectToGraphqlArgs(selectedFilesQueryArguments)}) {
					name
					storedName
					size
					mimeType
				}
			}
		`;

		// console.log(records);

		graphqlResponse = await graphQLClient.request(selectedFilesQuery);
		await copyFiles({
			files: graphqlResponse.file,
			folderId,
			userId,
			totalSize,
			records,
			initialize: res.locals.initialize,
		});
	}

	if (!res.locals.initialize)
		res.status(200).json({ message: 'successfully pasted' });
};

export default paste;

const copyFiles = async ({
	files,
	folderId,
	userId,
	totalSize,
	records,
	initialize,
}) => {
	const args = [];
	files.forEach((file) => {
		const { storedName, ...fileFields } = file;
		let newStoredName;

		if (!initialize) {
			let params;

			newStoredName = uuidv4()

			// copy files in s3
			params = {
				Bucket: S3_BUCKET,
				CopySource: `/${S3_BUCKET}/${storedName}`,
				Key: newStoredName,
			};
			s3.copyObject(params, function (err, data) {
				// if (err) console.log(err, err.stack); // an error occurred
				// else console.log(data); // successful response
			});
			params = {
				Bucket: S3_BUCKET,
				CopySource: `/${S3_BUCKET}/${thumbnailName(storedName)}`,
				Key: thumbnailName(newStoredName),
			};
			s3.copyObject(params, function (err, data) {
				// if (err) console.log(err, err.stack); // an error occurred
				// else console.log(data); // successful response
			});
		}
		// create new file records for the database
		const data = {
			...fileFields,
			storedName: initialize ? storedName : newStoredName,
			folderId,
			meta: genericMeta({ userId }),
		};
		args.push(data);
	});

	const size = files.reduce((partialSum, file) => partialSum + file.size, 0);

	const folderSizesUpdates = await folderSizesMutationUpdates(records, [
		{
			id: folderId,
			inc: true,
			size,
		},
	]);

	// finalize writing all files
	const mutation = gql`
		mutation {
			updateFolderMany(${objectToGraphqlArgs({ updates: folderSizesUpdates })}) {
				affected_rows
			}
			insertFile(${objectToGraphqlMutationArgs(args)}) {
				returning {
					id
				}
			}
		}
	`;

	await graphQLClient.request(mutation);
};

const copyFolder = async ({ folder, folderId, userId, records }) => {
	const { name } = folder;

	// create new file records for the database
	const data = {
		name,
		folderId,
		meta: genericMeta({ userId }),
	};

	const mutation = gql`
		mutation {
			insertFolderOne(${objectToGraphqlMutationArgs(data)}) {
				id
			}
		}
	`;

	const response = await graphQLClient.request(mutation);
	// adds nested folder to records
	records.addFolder({
		id: response.insertFolderOne.id,
		...data,
	});
	return response.insertFolderOne;
};

const recursiveFolderCopy = async ({
	folderIdToCopy,
	folderIdToCreateIn,
	userId,
	totalSize,
	records,
	initialize,
}) => {
	let graphqlResponse;

	// search all nested folders
	const nestedFolderQueryArguments = {
		where: {
			_and: [
				{ folderId: { _eq: folderIdToCopy } },
				{ deletedInRootToUserId: { _isNull: true } },
			],
		},
	};
	const nestedFolderQuery = gql`
		query {
			folder(${objectToGraphqlArgs(nestedFolderQueryArguments)}) {
				id
				name
			}
		}
	`;
	graphqlResponse = await graphQLClient.request(nestedFolderQuery);
	for (const folder of graphqlResponse.folder) {
		// copy these folders in the database
		const { id } = await copyFolder({
			folder,
			folderId: folderIdToCreateIn,
			userId,
			records,
		});

		// go through folders and find other folders and files
		await recursiveFolderCopy({
			folderIdToCopy: folder.id,
			folderIdToCreateIn: id,
			userId,
			totalSize,
			records,
			initialize,
		});
	}

	// all files that match the search query
	const fileQueryArguments = {
		where: {
			_and: [
				{ folderId: { _eq: folderIdToCopy } },
				{ deletedInRootToUserId: { _isNull: true } },
			],
		},
	};
	const fileQuery = gql`
		query {
			file(${objectToGraphqlArgs(fileQueryArguments)}) {
				name
				storedName
				size
				mimeType
			}
		}
	`;
	graphqlResponse = await graphQLClient.request(fileQuery);

	await copyFiles({
		files: graphqlResponse.file,
		folderId: folderIdToCreateIn,
		userId,
		totalSize,
		records,
		initialize,
	});
};

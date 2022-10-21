import { clipboard } from '..';
import {
	capitalizeFirstLetter,
	genericMeta,
	getUserId,
	thumbnailName,
	folderSizesMutationUpdates,
} from '../utils';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLClient, gql } from 'graphql-request';
import { graphQLClient } from '../endpoint.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import s3 from '../s3.js';
import { getRecords } from '../getRecordsMiddleware';

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

	if (type == 'cut') {
		delete clipboard[userId];

		let args, response;

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

		const folderSizesUpdates1 = await folderSizesMutationUpdates(
			cutCopyRecords,
			[...folderSizes]
		);

		const folderSizesUpdates2 = await folderSizesMutationUpdates(records, [
			{
				id: folderId,
				inc: true,
				size: totalSize,
			},
		]);

		const folderManyArgs = {
			updates: [...folderSizesUpdates1, ...folderSizesUpdates2, folderArgs],
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
					{ deletedInRootUserFolderId: { _isNull: true } },
				],
			},
		};
		const selectedFoldersQuery = gql`
			query {
				folder(${objectToGraphqlArgs(selectedFoldersQueryArguments)}) {
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
			});

			// handle nested folders
			for (const folderId of selectedFolders) {
				await recursiveFolderCopy({
					folderIdToCopy: folderId,
					folderIdToCreateIn: id,
					userId,
				});
			}
		}

		// copy selected Files
		const selectedFilesQueryArguments = {
			where: {
				_and: [
					{ id: { _in: selectedFiles } },
					{ deletedInRootUserFolderId: { _isNull: true } },
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
		});
	}

	res.status(200).json({ message: 'successfully pasted' });
};

export default paste;

const copyFiles = async ({ files, folderId, userId, totalSize, records }) => {
	const args = [];
	files.forEach((file) => {
		const { storedName, ...fileFields } = file;
		let params;

		const storedNameSplit = storedName.split('.');
		const newStoredName = `${uuidv4()}.${
			storedNameSplit[storedNameSplit.length - 1]
		}`;

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
			CopySource: `/${S3_BUCKET}/${storedName}`,
			Key: thumbnailName(newStoredName),
		};
		s3.copyObject(params, function (err, data) {
			// if (err) console.log(err, err.stack); // an error occurred
			// else console.log(data); // successful response
		});

		// create new file records for the database
		const data = {
			...fileFields,
			storedName: newStoredName,
			folderId,
			meta: genericMeta({ userId }),
		};
		args.push(data);
	});

	const folderSizesUpdates = await folderSizesMutationUpdates(records, [
		{
			id: folderId,
			inc: true,
			size: totalSize,
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

const copyFolder = async ({ folder, folderId, userId }) => {
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
	return response.insertFolderOne;
};

const recursiveFolderCopy = async ({
	folderIdToCopy,
	folderIdToCreateIn,
	userId,
}) => {
	let graphqlResponse;

	// search all nested folders
	const nestedFolderQueryArguments = {
		where: {
			_and: [
				{ folderId: { _eq: folderIdToCopy } },
				{ deletedInRootUserFolderId: { _isNull: true } },
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
		});

		// go through folders and find other folders and files
		await recursiveFolderCopy({
			folderIdToCopy: folder.id,
			folderIdToCreateIn: id,
			userId,
		});
	}

	// all files that match the search query
	const fileQueryArguments = {
		where: {
			_and: [
				{ folderId: { _eq: folderIdToCopy } },
				{ deletedInRootUserFolderId: { _isNull: true } },
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

	copyFiles({
		files: graphqlResponse.file,
		folderId: folderIdToCreateIn,
		userId,
	});
};

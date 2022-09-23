import { response } from 'express';
import { gql } from 'graphql-request';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getUserId } from './utils';

export const userEditCheck = async (req, res, next) => {
	const userId = getUserId(req);
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/remove') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/rename') {
		const { id, __typename } = req.body;
		if (__typename == 'Folder') selectedFolders = [id];
		else selectedFiles = [id];
	} else if (req.url == '/paste') {
		const { folderId } = req.body;
		selectedFolders = [folderId];
	} else if (req.url == '/cut') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/createNewFolder') {
		const { parentFolderId } = req.body;
		selectedFolders = [parentFolderId];
	} else if (req.url == '/upload') {
		const folderId = req.headers.folderid;
		selectedFolders = [folderId];
	}

	await userAccessTypeCheck({
		userId,
		selectedFolders,
		selectedFiles,
		accessType: 'EDIT',
		res,
		next,
	});
};

export const userViewCheck = async (req, res, next) => {
	const userId = getUserId(req);
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/getSharingLinks') {
		const { id, __typename } = req.body;
		if (__typename == 'Folder') selectedFolders = [id];
		else selectedFiles = [id];
	} else if (req.url == '/getFolderName') {
		const { id } = req.body;
		selectedFolders = [id];
	} else if (req.url == '/downloadFile') {
		const { id } = req.body;
		selectedFiles = [id];
	} else if (req.url == '/copy') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/search') {
		const { folderId } = req.body;
		selectedFolders = [folderId];
	}

	await userAccessTypeCheck({
		userId,
		selectedFolders,
		selectedFiles,
		accessType: 'VIEW',
		res,
		next,
	});
};

export const ownerCheck = async (req, res, next) => {
	const userId = getUserId(req);
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/refreshSharingLink') {
		const { id, __typename } = await getFolderFileIdFromSharingLink(
			req.body.id
		);
		if (__typename == 'Folder') selectedFolders = [id];
		else selectedFiles = [id];
	} else if (req.url == '/permanentlyDelete') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/restore') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	}

	await userAccessTypeCheck({
		userId,
		selectedFolders,
		selectedFiles,
		accessType: 'OWNER',
		res,
		next,
	});
};

// maybe can reuse this in upload, even with the res
export const userAccessTypeCheck = async ({
	userId,
	selectedFolders,
	selectedFiles,
	accessType,
	res,
	next,
}) => {
	const initialMetaFetchData = await initialMetaFetch({
		selectedFolders: selectedFolders.filter((id) => id), // is defined, null cases are all accounted for
		selectedFiles: selectedFiles.filter((id) => id), // is defined, null cases are all accounted for
	});

	const userCollection = await sharingCollectionOfUserFetch({ userId });
	// check all parent folders to determine if they have a view or edit link
	if (
		await authorizedForAccessType({
			userCollection,
			accessType,
			userId,
			...initialMetaFetchData,
		})
	) {
		next();
		return;
	}

	res.status(403).json({ message: 'unauthorized' });
	return;
};

const authorizedForAccessType = async ({
	files,
	folders,
	userCollection,
	accessType,
	userId,
}) => {
	let response;

	const _helper = async (record, __typename) => {
		let isAuthorized = false;
		if (accessType != 'OWNER') {
			if (accessType == 'EDIT') {
				const editPermissionOfThisFile =
					record.meta.sharingPermission.sharingPermissionLinks.find(
						(el) => el.accessType == 'EDIT'
					);
				isAuthorized = userCollection.includes(editPermissionOfThisFile.link);
			} else {
				// either permission is fine for view
				isAuthorized = userCollection.includes(
					record.meta.sharingPermission.sharingPermissionLinks[0].link
				);
				if (!isAuthorized)
					// if still false, check the next one
					isAuthorized = userCollection.includes(
						record.meta.sharingPermission.sharingPermissionLinks[1].link
					);
			}
		}

		if (!isAuthorized) {
			let id;
			if (__typename == 'Folder') {
				const { parentFolderId, meta } = record;
				if (!parentFolderId && meta.userId != userId) return false; // terminating condition, not the owner of the root folder
				id = parentFolderId;
			} else {
				const { folderId, meta } = record;
				if (!folderId && meta.userId != userId) return false; // terminating condition, not the owner of the root folder
				id = folderId;
			}

			// fetch parent data
			const queryArgs = {
				where: {
					id: { _eq: id },
				},
			};
			const query = gql`
				query {
					folder(${objectToGraphqlArgs(queryArgs)}) {
						parentFolderId
						meta {
							userId
							sharingPermission{
								sharingPermissionLinks{
									accessType
									link
								}
							}
						}
					}
				}
			`;
			response = await graphQLClient.request(query);

			isAuthorized = await authorizedForAccessType({
				files: [],
				folders: [response.folder[0]],
				userCollection,
				accessType,
			});
			console.log({ isAuthorized });
			if (!isAuthorized) return false; // terminating condition
		}
		return true;
	};

	for (const folder of folders) {
		const isAuthorized = await _helper(folder, 'Folder');
		if (!isAuthorized) return false; // terminating condition
	}

	for (const file of files) {
		const isAuthorized = await _helper(file, 'File');
		if (!isAuthorized) return false; // terminating condition
	}

	return true;
};

const sharingCollectionOfUserFetch = async ({ userId }) => {
	let queryArgs, query, response;

	queryArgs = {
		where: {
			userId: { _eq: userId },
		},
	};
	query = gql`
		query {
			sharedWithMe(${objectToGraphqlArgs(queryArgs)}) {
				collection
			}
		}
	`;
	response = await graphQLClient.request(query);
	return response.sharedWithMe.length == 0
		? null
		: JSON.parse(response.sharedWithMe[0].collection);
};

const initialMetaFetch = async ({ selectedFolders, selectedFiles }) => {
	let queryArgs, query, response;

	queryArgs = {
		where: {
			id: { _in: selectedFolders },
		},
	};
	query = gql`
		query {
			folder(${objectToGraphqlArgs(queryArgs)}) {
				parentFolderId
				meta {
					userId
					sharingPermission{
						sharingPermissionLinks{
							accessType
							link
						}
					}
				}
			}
		}
	`;
	response = await graphQLClient.request(query);
	const folders = response.folder;

	queryArgs = {
		where: {
			id: { _in: selectedFiles },
		},
	};
	query = gql`
		query {
			file(${objectToGraphqlArgs(queryArgs)}) {
				folderId
				meta {
					userId
					sharingPermission{
						sharingPermissionLinks{
							accessType
							link
						}
					}
				}
			}
		}
	`;
	response = await graphQLClient.request(query);
	const files = response.file;

	return { folders, files };
};

// returns the "one owner userId" or false
export const allByOneOwner = ({ folders, files }) => {
	let allRecords = [];

	allRecords = [...allRecords, ...folders.map((record) => record.meta.userId)];

	allRecords = [...allRecords, ...files.map((record) => record.meta.userId)];

	allRecords = [...new Set(allRecords)];
	if (allRecords.length == 1) {
		// all userId of the records are the same, and it is of the owner
		return allRecords[0];
	}
	return false;
};

const getFolderFileIdFromSharingLink = async (id) => {
	let query, response;
	const queryArgs = {
		where: {
			meta: {
				sharingPermission: { sharingPermissionLinks: { id: { _eq: id } } },
			},
		},
	};
	query = gql`
		query {
			folder(${objectToGraphqlArgs(queryArgs)}) {
				id
			}
		}
	`;
	response = await graphQLClient.request(query);
	if (response.folder.length != 0)
		return { id: response.folder[0].id, __typename: 'Folder' };

	query = gql`
		query {
			file(${objectToGraphqlArgs(queryArgs)}) {
				id
			}
		}
	`;
	response = await graphQLClient.request(query);
	if (response.file.length != 0)
		return { id: response.file[0].id, __typename: 'File' };
};

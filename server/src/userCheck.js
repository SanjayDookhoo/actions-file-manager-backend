import { response } from 'express';
import { gql } from 'graphql-request';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getUserId } from './utils';

export const userEditCheck = async (req, res, next) => {
	const userId = getUserId({ req });
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/remove') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/rename') {
		const { id, __typename } = req.body;
		if (__typename == 'folder') selectedFolders = [id];
		else selectedFiles = [id];
	} else if (req.url == '/paste') {
		const { folderId } = req.body;
		selectedFolders = [folderId];
	} else if (req.url == '/cut') {
		selectedFolders = req.body.selectedFolders;
		selectedFiles = req.body.selectedFiles;
	} else if (req.url == '/createNewFolder') {
		const { folderId } = req.body;
		selectedFolders = [folderId];
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
	const userId = getUserId({ req });
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/getSharingLinks') {
		const { id, __typename } = req.body;
		if (__typename == 'folder') selectedFolders = [id];
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
		if (Number.isInteger(folderId)) {
			selectedFolders = [folderId];
		}
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
	const userId = getUserId({ req });
	let selectedFolders = [],
		selectedFiles = [];

	// assign selectedFolders and selected Files
	if (req.url == '/refreshSharingLink') {
		const { id, __typename } = await getFolderFileIdFromSharingLink(
			req.body.id
		);
		if (__typename == 'folder') selectedFolders = [id];
		else selectedFiles = [id];
	} else if (req.url == '/permanentlyDelete') {
		selectedFolders = req.body.selectedFolders ?? [];
		selectedFiles = req.body.selectedFiles ?? [];
	} else if (req.url == '/restore') {
		selectedFolders = req.body.selectedFolders ?? [];
		selectedFiles = req.body.selectedFiles ?? [];
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
		if (next) next();
		return true;
	}

	if (res) res.status(403).json({ message: 'unauthorized' });
	return false;
};

const authorizedForAccessType = async ({
	files,
	folders,
	userCollection,
	accessType,
	userId,
}) => {
	let response;

	const _helper = async (record) => {
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

		if (isAuthorized) return true;

		let id;
		const { folderId, meta } = record;
		if (!folderId && meta.userId != userId) return false; // terminating condition, not the owner of the root folder
		if (!folderId && meta.userId == userId) return true; // root folder is the user's folder
		id = folderId;

		if (id) {
			// fetch parent data
			const queryArgs = {
				where: {
					id: { _eq: id },
				},
			};
			const query = gql`
					query {
						folder(${objectToGraphqlArgs(queryArgs)}) {
							id
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

			isAuthorized = await authorizedForAccessType({
				files: [],
				folders: [response.folder[0]],
				userCollection,
				accessType,
				userId,
			});
			// console.log(isAuthorized);
			return isAuthorized; // terminating condition
			// if (!isAuthorized) return false; // terminating condition
		}
	};

	for (const folder of folders) {
		const isAuthorized = await _helper(folder);
		if (!isAuthorized) return false; // terminating condition
	}

	for (const file of files) {
		const isAuthorized = await _helper(file);
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
		? []
		: JSON.parse(response.sharedWithMe[0].collection);
};

const initialMetaFetch = async ({ selectedFolders, selectedFiles }) => {
	let queryArgs, response;

	queryArgs = {
		where: {
			id: { _in: selectedFolders },
		},
	};
	const query = (__typename) => {
		return gql`
			query {
				${__typename}(${objectToGraphqlArgs(queryArgs)}) {
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
	};
	response = await graphQLClient.request(query('folder'));
	const folders = response.folder;

	queryArgs = {
		where: {
			id: { _in: selectedFiles },
		},
	};
	response = await graphQLClient.request(query('file'));
	const files = response.file;

	return { folders, files };
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
		return { id: response.folder[0].id, __typename: 'folder' };

	query = gql`
		query {
			file(${objectToGraphqlArgs(queryArgs)}) {
				id
			}
		}
	`;
	response = await graphQLClient.request(query);
	if (response.file.length != 0)
		return { id: response.file[0].id, __typename: 'file' };
};

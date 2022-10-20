import { response } from 'express';
import { gql } from 'graphql-request';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { Records } from './Records';
import { getUserId } from './utils';

export const getRecordsMiddleware = async (req, res, next) => {
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
	} else if (req.url == '/getSharingLinks') {
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
	} else if (req.url == '/refreshSharingLink') {
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

	res.locals.records = await getRecords({ selectedFiles, selectedFolders });

	if (next) {
		// doesnt have to be defined and can be used as not a middleware, can be called after a large upload, to ensure the most recent files and folders sizes are taken into account
		next();
	}
};

export const getRecords = async ({ selectedFolders, selectedFiles }) => {
	selectedFolders = [...new Set(selectedFolders)];
	selectedFiles = [...new Set(selectedFiles)];

	const data = {
		folders: {},
		files: {},
	};

	// creates objects of all folders and files that are encountered through all paths
	for (const id of selectedFolders) {
		await getFolderpaths({ id, __typename: 'folder', data });
	}

	for (const id of selectedFiles) {
		await getFolderpaths({ id, __typename: 'file', data });
	}

	const records = new Records({ ...data, selectedFiles, selectedFolders });
	return records;
};

const getFolderpaths = async ({ id, __typename, data }) => {
	const __typenameProperty = __typename + 's';

	if (!id) return;
	if (data[__typenameProperty][id]) return; // if it already exists, no need to query database

	const queryArgs = {
		where: {
			id: { _eq: id },
		},
	};
	const query = gql`
		query {
			${__typename}(${objectToGraphqlArgs(queryArgs)}) {
				id
				name
				folderId
				size
				${__typename == 'folder' ? 'trashSize' : ''}
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
	const response = await graphQLClient.request(query);
	const record = response[__typename][0];
	data[__typenameProperty][id] = record; // assign to data
	const { folderId } = record;

	await getFolderpaths({
		id: folderId,
		__typename: 'folder',
		data,
	});
};

// TODO revisit the need for this function
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

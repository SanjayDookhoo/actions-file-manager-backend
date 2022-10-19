import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	genericMeta,
	getAllParentFolderIdsAndSize,
	getRootFolder,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import getRootUserFolder from './getRootUserFolder';

const restore = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	let mutation;
	let response;

	let folderArgs;
	let fileArgs;
	let rootUserFolderIds = [];

	const { ids, size } = await getAllParentFolderIdsAndSize({
		selectedFolders,
		selectedFiles,
		all,
	});

	const folderSizesUpdates = await folderSizesMutationUpdates([
		{
			ids,
			inc: true,
			size,
		},
	]);

	if (all) {
		folderArgs = fileArgs = {
			where: {
				deletedInRootUserFolderId: { _isNull: false },
			},
			_set: { deletedInRootUserFolderId: null },
		};
		// TODO for all, need to get root folder of user
	} else {
		folderArgs = {
			where: {
				id: { _in: selectedFolders },
			},
			_set: { deletedInRootUserFolderId: null },
		};
		fileArgs = {
			where: {
				id: { _in: selectedFiles },
			},
			_set: { deletedInRootUserFolderId: null },
		};

		for (const selectedFolder of selectedFolders) {
			const rootFolder = await getRootFolder({
				id: selectedFolder,
				__typename: 'folder',
			});
			rootUserFolderIds.push(rootFolder.id);
		}
		for (const selectedFile of selectedFiles) {
			const rootFolder = await getRootFolder({
				id: selectedFile,
				__typename: 'file',
			});
			rootUserFolderIds.push(rootFolder.id);
		}
	}

	rootUserFolderIds = [...new Set(rootUserFolderIds)];
	const rootFolderTrashSizeUpdate = {
		where: {
			id: { _in: rootUserFolderIds },
		},
		_inc: { trashSize: size * -1 },
	};

	const folderManyArgs = {
		updates: [folderArgs, ...folderSizesUpdates, rootFolderTrashSizeUpdate],
	};

	const fileManyArgs = {
		updates: [fileArgs],
	};

	mutation = gql`
		mutation {
			updateFolderMany(${objectToGraphqlArgs(folderManyArgs)}) {
				affected_rows
			}
			updateFileMany(${objectToGraphqlArgs(fileManyArgs)}) {
				affected_rows
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json(response);
};

export default restore;

import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	genericMeta,
	getAllParentFolderIdsAndSize,
	getRootFolder,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const permanentlyDelete = async (req, res) => {
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
			inc: false,
			size,
		},
	]);

	if (all) {
		folderArgs = {
			where: {
				deletedInRootUserFolderId: { _isNull: false },
			},
		};
		fileArgs = {
			where: {
				deletedInRootUserFolderId: { _isNull: false },
			},
		};
		// TODO for all, need to get root folder of user
	} else {
		folderArgs = {
			where: {
				id: { _in: selectedFolders },
			},
		};
		fileArgs = {
			where: {
				id: { _in: selectedFiles },
			},
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
	// TODO deleteFolder and updateFolder should be seperate, etc
	// delete files first, when folders are deleted, all of its children will be cascade deleted, files important incase it has no folder parent
	mutation = gql`
		mutation {
			deleteFolder(${objectToGraphqlArgs(folderManyArgs)}) {
				affected_rows
			}
			deleteFile(${objectToGraphqlArgs(fileManyArgs)}) {
				affected_rows
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json(response);
};

export default permanentlyDelete;

import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	genericMeta,
	getAllParentFolderIdsAndSize,
	getRootFolder,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const remove = async (req, res) => {
	const { selectedFolders, selectedFiles } = req.body;
	let mutation;
	let response;
	let rootUserFolderIds = [];

	let folderManyArgs = [];

	let fileManyArgs = [];

	for (const selectedFolder of selectedFolders) {
		const rootFolder = await getRootFolder({
			id: selectedFolder,
			__typename: 'folder',
		});
		const { userId } = rootFolder.meta;
		rootUserFolderIds.push(rootFolder.id);

		const folderArgs = {
			where: {
				id: { _eq: selectedFolder },
			},
			_set: { deletedInRootUserFolderId: userId },
		};
		folderManyArgs.push(folderArgs);
	}

	for (const selectedFile of selectedFiles) {
		const rootFolder = await getRootFolder({
			id: selectedFile,
			__typename: 'file',
		});
		const { userId } = rootFolder.meta;
		rootUserFolderIds.push(rootFolder.id);

		const fileArgs = {
			where: {
				id: { _eq: selectedFile },
			},
			_set: { deletedInRootUserFolderId: userId },
		};
		fileManyArgs.push(fileArgs);
	}

	const { ids, size } = await getAllParentFolderIdsAndSize({
		selectedFolders,
		selectedFiles,
	});

	const folderSizesUpdates = await folderSizesMutationUpdates([
		{
			ids,
			inc: false,
			size,
		},
	]);

	rootUserFolderIds = [...new Set(rootUserFolderIds)];
	const rootFolderTrashSizeUpdate = {
		where: {
			id: { _in: rootUserFolderIds },
		},
		_inc: { trashSize: size },
	};

	folderManyArgs = {
		updates: [
			...folderManyArgs,
			...folderSizesUpdates,
			rootFolderTrashSizeUpdate,
		],
	};

	fileManyArgs = { updates: fileManyArgs };

	mutation = gql`
		mutation {
			updateFolderMany(${objectToGraphqlArgs(folderManyArgs)}) {
				returning {
					id
				}
			}
			updateFileMany(${objectToGraphqlArgs(fileManyArgs)}) {
				returning {
					id
				}
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json({});
};

export default remove;

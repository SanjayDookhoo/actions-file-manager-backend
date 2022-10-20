import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	folderTrashSizesMutationUpdates,
	genericMeta,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import getRootUserFolder from './getRootUserFolder';

const restore = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	const { records } = res.locals;

	let mutation;
	let response;

	let folderManyArgs = [];
	let fileManyArgs = [];

	let folderArgs;
	let fileArgs;

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
	}

	const folderIdsAndSizes = records.getFolderIdsAndSizes();
	const folderSizes = [];
	const folderTrashSizes = [];

	Object.entries(folderIdsAndSizes).forEach(([id, size]) => {
		folderSizes.push({
			id,
			inc: true,
			size,
		});
		folderTrashSizes.push({
			id,
			inc: false,
			size,
		});
	});
	const folderSizesUpdates = folderSizesMutationUpdates(records, folderSizes);
	const folderTrashSizesUpdates = folderTrashSizesMutationUpdates(
		records,
		folderTrashSizes
	);

	folderManyArgs = {
		updates: [
			...folderManyArgs,
			...folderSizesUpdates,
			...folderTrashSizesUpdates,
		],
	};

	fileManyArgs = {
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

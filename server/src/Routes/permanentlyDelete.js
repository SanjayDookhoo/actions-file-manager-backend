import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	folderTrashSizesMutationUpdates,
	genericMeta,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const permanentlyDelete = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	const { records } = res.locals;

	let mutation;
	let response;

	let folderArgs;
	let fileArgs;

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
	}

	const folderIdsAndSizes = records.getFolderIdsAndSizes();
	const folderTrashSizes = Object.entries(folderIdsAndSizes).map(
		([id, size]) => ({
			id,
			inc: false,
			size,
		})
	);

	const folderTrashSizesUpdates = folderTrashSizesMutationUpdates(
		records,
		folderTrashSizes
	);

	const folderManyArgs = {
		updates: folderTrashSizesUpdates,
	};

	// TODO deleteFolder and updateFolder should be seperate, etc
	// delete files first, when folders are deleted, all of its children will be cascade deleted, files important incase it has no folder parent
	mutation = gql`
		mutation {
			updateFolderMany(${objectToGraphqlArgs(folderManyArgs)}) {
				affected_rows
			}
			deleteFolder(${objectToGraphqlArgs(folderArgs)}) {
				affected_rows
			}
			deleteFile(${objectToGraphqlArgs(fileArgs)}) {
				affected_rows
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json(response);
};

export default permanentlyDelete;

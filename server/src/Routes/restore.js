import { graphQLClient } from '../endpoint';
import {
	folderSizesMutationUpdates,
	folderTrashSizesMutationUpdates,
	genericMeta,
} from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import getRootUserFolder from './getRootUserFolder';
import { getRecords } from '../getRecordsMiddleware';

const restore = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	let records;

	let mutation;
	let response;

	let folderManyArgs = [];
	let fileManyArgs = [];

	let folderArgs;
	let fileArgs;

	if (all) {
		const queryArgs = {
			where: {
				deletedInRootUserFolderId: { _isNull: false },
			},
		};
		folderArgs = fileArgs = {
			...queryArgs,
			_set: { deletedInRootUserFolderId: null },
		};

		const query = gql`
			query {
				folder(${objectToGraphqlArgs(queryArgs)}) {
					id
				}
				file(${objectToGraphqlArgs(queryArgs)}) {
					id
				}
			}
		`;
		response = await graphQLClient.request(query);

		const selectedFiles = response.file.map((record) => record.id);
		const selectedFolders = response.folder.map((record) => record.id);

		records = await getRecords({ selectedFiles, selectedFolders });
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

		records = res.locals.records;
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
	const folderSizesUpdates = await folderSizesMutationUpdates(
		records,
		folderSizes
	);
	const folderTrashSizesUpdates = folderTrashSizesMutationUpdates(
		records,
		folderTrashSizes
	);

	folderManyArgs = {
		updates: [folderArgs, ...folderSizesUpdates, ...folderTrashSizesUpdates],
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
	// res.json({});
};

export default restore;

import { graphQLClient } from '../endpoint.js';
import {
	folderSizesMutationUpdates,
	folderTrashSizesMutationUpdates,
} from '../utils.js';
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const remove = async (req, res) => {
	const { selectedFolders, selectedFiles } = req.body;
	const { records } = res.locals;

	let mutation;
	let response;

	let folderManyArgs = [];
	let fileManyArgs = [];

	for (const selectedFolder of selectedFolders) {
		const rootFolder = records.getFolderRoot(selectedFolder);
		const { userId } = rootFolder.meta;

		const folderArgs = {
			where: {
				id: { _eq: selectedFolder },
			},
			_set: { deletedInRootToUserId: userId },
		};
		folderManyArgs.push(folderArgs);
	}

	for (const selectedFile of selectedFiles) {
		const rootFolder = records.getFileRoot(selectedFile);
		const { userId } = rootFolder.meta;

		const fileArgs = {
			where: {
				id: { _eq: selectedFile },
			},
			_set: { deletedInRootToUserId: userId },
		};
		fileManyArgs.push(fileArgs);
	}

	const folderIdsAndSizes = records.getFolderIdsAndSizes();
	const folderSizes = [];
	const folderTrashSizes = [];

	Object.entries(folderIdsAndSizes).forEach(([id, size]) => {
		folderSizes.push({
			id,
			inc: false,
			size,
		});
		folderTrashSizes.push({
			id,
			inc: true,
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
		updates: [
			...folderManyArgs,
			...folderSizesUpdates,
			...folderTrashSizesUpdates,
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

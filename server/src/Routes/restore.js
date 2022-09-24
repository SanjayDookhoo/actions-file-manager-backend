import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const restore = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	let mutation;
	let response;

	let folderArgs;
	let fileArgs;

	if (all) {
		folderArgs = fileArgs = {
			where: {
				deletedInRootUserFolderId: { _isNull: false },
			},
			_set: { deletedInRootUserFolderId: null },
		};
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

	mutation = gql`
		mutation {
			updateFolder(${objectToGraphqlArgs(folderArgs)}) {
				returning {
					id
				}
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	mutation = gql`
		mutation {
			updateFile(${objectToGraphqlArgs(fileArgs)}) {
				returning {
					id
				}
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json(response);
};

export default restore;

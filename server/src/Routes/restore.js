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
				deleted: { _eq: true },
			},
			_set: { deleted: false },
		};
	} else {
		folderArgs = {
			where: {
				id: { _in: selectedFolders },
			},
			_set: { deleted: false },
		};
		fileArgs = {
			where: {
				id: { _in: selectedFiles },
			},
			_set: { deleted: false },
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

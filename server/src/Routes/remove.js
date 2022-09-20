import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const remove = async (req, res) => {
	const { selectedFolders, selectedFiles } = req.body;
	let mutation;
	let response;
	const folderArgs = {
		where: {
			id: { _in: selectedFolders },
		},
		_set: { deleted: true },
	};
	const fileArgs = {
		where: {
			id: { _in: selectedFiles },
		},
		_set: { deleted: true },
	};

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

export default remove;

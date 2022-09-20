import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

// because the newFolder has some meta assigned to it, it will be better to handle the entire folder creation on the backend
const rename = async (req, res) => {
	const { name, id, __typename } = req.body;
	let mutation;
	const args = {
		where: {
			id: { _eq: id },
		},
		_set: { name },
	};

	if (__typename == 'Folder') {
		mutation = gql`
			mutation {
				updateFolder(${objectToGraphqlArgs(args)}) {
					returning {
						id
					}
				}
			}
		`;
	} else {
		mutation = gql`
			mutation {
				updateFile(${objectToGraphqlArgs(args)}) {
					returning {
						id
					}
				}
			}
		`;
	}

	const response = await graphQLClient.request(mutation);
	res.json(response);
};

export default rename;

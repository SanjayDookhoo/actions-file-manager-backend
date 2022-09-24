import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const rename = async (req, res) => {
	const { name, id, __typename } = req.body;
	let mutation;
	const args = {
		where: {
			id: { _eq: id },
		},
		_set: { name },
	};

	if (__typename == 'folder') {
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

import { graphQLClient } from '../endpoint';
import { capitalizeFirstLetter } from '../utils';
import { objectToGraphqlArgs } from 'hasura-args';
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

	mutation = gql`
		mutation {
			update${capitalizeFirstLetter(__typename)}(${objectToGraphqlArgs(args)}) {
				returning {
					id
				}
			}
		}
	`;

	const response = await graphQLClient.request(mutation);
	res.json(response);
};

export default rename;

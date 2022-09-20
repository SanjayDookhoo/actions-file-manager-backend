import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const getFolderName = async (req, res) => {
	const { id } = req.body;

	const queryArguments = {
		id,
	};
	const query = gql`
		query {
			folderByPk(${objectToGraphqlArgs(queryArguments)}) {
				name
			}
		}
	`;

	const response = await graphQLClient.request(query);
	res.json(response.folderByPk);
};

export default getFolderName;

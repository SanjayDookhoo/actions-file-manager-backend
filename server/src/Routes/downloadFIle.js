import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

// because the newFolder has some meta assigned to it, it will be better to handle the entire folder creation on the backend
const downloadFIle = async (req, res) => {
	const { id } = req.body;

	const queryArgs = {
		id,
	};
	const query = gql`
		query {
			fileByPk(${objectToGraphqlArgs(queryArgs)}) {
				fileLink {
					URL
				}
			}
		}
	`;

	const response = await graphQLClient.request(query);
	res.json(response.fileByPk.fileLink);
};

export default downloadFIle;

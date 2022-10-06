import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

// because the newFolder has some meta assigned to it, it will be better to handle the entire folder creation on the backend
const downloadFIle = async (req, res) => {
	const { id } = req.body;

	// get link
	const queryArgs = {
		id,
	};
	const query = gql`
		query {
			fileByPk(${objectToGraphqlArgs(queryArgs)}) {
				metaId
				fileLink {
					URL
					thumbnailURL
				}
			}
		}
	`;
	const response = await graphQLClient.request(query);

	// update lastAccessed
	const mutationArgs = {
		where: {
			id: { _eq: response.fileByPk.metaId },
		},
		_set: { lastAccessed: 'now()' },
	};
	const mutation = gql`
		mutation {
			updateMeta(${objectToGraphqlArgs(mutationArgs)}) {
				affected_rows
			}
		}
	`;
	await graphQLClient.request(mutation);

	res.json(response.fileByPk.fileLink);
};

export default downloadFIle;

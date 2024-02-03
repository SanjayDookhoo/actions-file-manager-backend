import { graphQLClient } from '../endpoint.js';
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const downloadFile = async (req, res) => {
	const { id } = req.body;

	// get link
	const queryArgs = {
		id,
	};
	const query = gql`
		query {
			fileByPk(${objectToGraphqlArgs(queryArgs)}) {
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
			fileId: { _eq: id },
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

export default downloadFile;

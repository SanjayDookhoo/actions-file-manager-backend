import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const addSharedWithMe = async (req, res) => {
	const { sharedIdLink } = req.body;
	if (!sharedIdLink) {
		res.json({});
		return;
	}

	let response;

	const queryArgs = {
		where: { userId: { _eq: '123' } },
	};

	const query = gql`
		query {
			sharedWithMe(${objectToGraphqlArgs(queryArgs)}) {
				collection
			}
		}
	`;
	response = await graphQLClient.request(query);

	if (response.sharedWithMe.length == 0) {
		const mutationArgs = {
			userId: '123', // TODO change
			collection: JSON.stringify([sharedIdLink]),
		};

		const mutation = gql`
			mutation {
				insertSharedOne(${objectToGraphqlMutationArgs(mutationArgs)}) {
					id
				}
			}
		`;
		await graphQLClient.request(mutation);
	} else {
		const collection = JSON.parse(response.sharedWithMe[0].collection);

		if (!collection.includes(sharedIdLink)) {
			const mutationArgs = {
				where: { userId: { _eq: '123' } },
				_set: {
					collection: JSON.stringify([...collection, sharedIdLink]),
				},
			};

			const mutation = gql`
				mutation {
					updateShared(${objectToGraphqlArgs(mutationArgs)}) {
						returning {
							id
						}
					}
				}
			`;
			await graphQLClient.request(mutation);
		}
	}
	res.json({});
};

export default addSharedWithMe;

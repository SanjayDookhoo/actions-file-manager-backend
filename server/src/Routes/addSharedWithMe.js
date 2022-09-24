import { graphQLClient } from '../endpoint';
import { genericMeta, getUserId } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const addSharedWithMe = async (req, res) => {
	const { link } = req.body;
	if (!link) {
		res.json({});
		return;
	}

	let response;

	const userId = getUserId({ req });
	if (!userId) return 400;

	const queryArgs = {
		where: { userId: { _eq: userId } },
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
			userId, // TODO change
			collection: JSON.stringify([link]),
		};

		const mutation = gql`
			mutation {
				insertSharedWithMeOne(${objectToGraphqlMutationArgs(mutationArgs)}) {
					id
				}
			}
		`;
		await graphQLClient.request(mutation);
	} else {
		const collection = JSON.parse(response.sharedWithMe[0].collection);

		if (!collection.includes(link)) {
			const mutationArgs = {
				where: { userId: { _eq: userId } },
				_set: {
					collection: JSON.stringify([...collection, link]),
				},
			};

			const mutation = gql`
				mutation {
					updateSharedWithMe(${objectToGraphqlArgs(mutationArgs)}) {
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

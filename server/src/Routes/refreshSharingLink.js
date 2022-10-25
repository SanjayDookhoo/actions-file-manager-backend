import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import { v4 as uuidv4 } from 'uuid';

const refreshSharingLink = async (req, res) => {
	const { id } = req.body;
	let args, mutation, query;

	args = {
		where: {
			id: { _eq: id },
		},
		_set: {
			link: uuidv4(),
		},
	};

	mutation = gql`
		mutation {
			updateSharingPermissionLink(${objectToGraphqlArgs(args)}) {
				returning {
					id
					link
				}
			}
		}
	`;
	let response = await graphQLClient.request(mutation);
	response = response.updateSharingPermissionLink;

	// update modified for file or folder in question
	const updateModified = async (__typename) => {
		args = {
			where: {
				meta: {
					sharingPermission: {
						sharingPermissionLinks: { id: { _eq: id } },
					},
				},
			},
		};
		query = gql`
			query {
				${__typename}(${objectToGraphqlArgs(args)}) {
					id
				}
			}
		`;
		const queryResponse = await graphQLClient.request(query);
		if (queryResponse[__typename].length != 0) {
			const mutationArgs = {
				where: {
					[`${__typename}Id`]: { _eq: queryResponse[__typename][0].id },
				},
				_set: { modified: 'now()' },
			};
			const mutation = gql`
				mutation {
					updateMeta(${objectToGraphqlArgs(mutationArgs)}) {
						affected_rows
					}
				}
			`;
			await graphQLClient.request(mutation);
		}
	};
	await updateModified('file');
	await updateModified('folder');

	res.json(response);
};

export default refreshSharingLink;

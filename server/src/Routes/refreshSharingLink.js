import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import { v4 as uuidv4 } from 'uuid';

const refreshSharingLink = async (req, res) => {
	const { id } = req.body;

	const mutationArgs = {
		where: {
			id: { _eq: id },
		},
		_set: {
			link: uuidv4(),
		},
	};

	const mutation = gql`
		mutation {
			updateSharingPermissionLink(${objectToGraphqlArgs(mutationArgs)}) {
				returning {
					id
					link
				}
			}
		}
	`;
	let response = await graphQLClient.request(mutation);
	response = response.updateSharingPermissionLink;

	res.json(response);
};

export default refreshSharingLink;

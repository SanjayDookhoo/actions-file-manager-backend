import { graphQLClient } from '../endpoint';
import { getUserId } from '../utils';
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const getSharingLinks = async (req, res) => {
	const { id, __typename } = req.body;
	const userId = getUserId({ req });
	let response;

	const queryArgs = {
		id,
	};
	const query = gql`
		query {
			${__typename}ByPk(${objectToGraphqlArgs(queryArgs)}) {
				name
				meta {
					userId
					sharingPermission{
						sharingPermissionLinks{
							id
							accessType
							link
						}
					}
				}
			}
		}
	`;
	response = await graphQLClient.request(query);
	response = response[`${__typename}ByPk`];
	if (response.meta.userId !== userId) {
		response = response.meta.sharingPermission.sharingPermissionLinks.filter(
			(record) => record.accessType === 'VIEW'
		);
	} else {
		response = response.meta.sharingPermission.sharingPermissionLinks;
	}

	res.json(response);
};

export default getSharingLinks;

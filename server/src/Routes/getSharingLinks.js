import { graphQLClient } from '../endpoint';
import { genericMeta, getUserId } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const getSharingLinks = async (req, res) => {
	const { id, __typename } = req.body;
	const userId = getUserId(req);
	let response;

	if (__typename == 'Folder') {
		const queryArgs = {
			id,
		};
		const query = gql`
			query {
				folderByPk(${objectToGraphqlArgs(queryArgs)}) {
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
		response = response.folderByPk;
		if (response.meta.userId != userId) {
			response = response.meta.sharingPermission.sharingPermissionLinks.filter(
				(record) => record.accessType == 'VIEW'
			);
		} else {
			response = response.meta.sharingPermission.sharingPermissionLinks;
		}
	} else {
		const queryArgs = {
			id,
		};
		const query = gql`
			query {
				fileByPk(${objectToGraphqlArgs(queryArgs)}) {
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
		response = response.fileByPk;
		if (response.meta.userId != userId) {
			response = response.meta.sharingPermission.sharingPermissionLinks.filter(
				(record) => record.accessType == 'VIEW'
			);
		} else {
			response = response.meta.sharingPermission.sharingPermissionLinks;
		}
	}

	res.json(response);
};

export default getSharingLinks;

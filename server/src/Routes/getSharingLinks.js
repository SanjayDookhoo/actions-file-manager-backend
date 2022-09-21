import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const getSharingLinks = async (req, res) => {
	const { id, __typename } = req.body;
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
	} else {
		const queryArgs = {
			id,
		};
		const query = gql`
			query {
				fileByPk(${objectToGraphqlArgs(queryArgs)}) {
					name
					meta {
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
	}

	res.json(response);
};

export default getSharingLinks;

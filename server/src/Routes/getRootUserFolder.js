import { graphQLClient } from '../endpoint';
import { genericMeta, getUserId } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

//create root folder for each user, to prevent the need to deal with null as a folderId or folderId
const getRootUserFolder = async (req, res) => {
	const userId = getUserId({ req });
	let response;

	const queryArgs = {
		where: {
			_and: [
				{ folderId: { _isNull: true } },
				{
					meta: {
						userId: { _eq: userId },
					},
				},
			],
		},
	};
	const query = gql`
        query {
            folder(${objectToGraphqlArgs(queryArgs)}) {
                id
            }
        }
    `;
	response = await graphQLClient.request(query);

	if (response.folder.length === 0) {
		const mutationArguments = {
			name: `${userId}_root_folder`,
			trashSize: 0,
			meta: genericMeta({ req }),
		};
		const mutation = gql`
			mutation {
				insertFolderOne(${objectToGraphqlMutationArgs(mutationArguments)}) {
					id
				}
			}
		`;
		const response = await graphQLClient.request(mutation);
		console.log(response.insertFolderOne);
		res.json(response.insertFolderOne);
	} else {
		res.json(response.folder[0]);
	}
};

export default getRootUserFolder;

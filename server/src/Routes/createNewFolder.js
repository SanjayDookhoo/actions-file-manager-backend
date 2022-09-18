import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

// because the newFolder has some meta assigned to it, it will be better to handle the entire folder creation on the backend
const createNewFolder = async (req, res) => {
	const { name, parentFolderId } = req.body;

	const mutationArguments = {
		name,
		parentFolderId,
		meta: genericMeta(),
	};

	const mutation = gql`
        mutation {
            insertFolderOne(${objectToGraphqlMutationArgs(mutationArguments)}) {
                id
            }
        }
    `;

	const response = await graphQLClient.request(mutation);
	res.json(response);
};

export default createNewFolder;

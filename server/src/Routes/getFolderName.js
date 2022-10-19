import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const getFolderName = async (req, res) => {
	const { id } = req.body;
	const { records } = res.locals;
	const { name } = records.getFolder(id);

	res.json({ name });
};

export default getFolderName;

import graphql from 'graphql';
import s3 from '../../s3.js';
import FileType from './TypeDefs/FileType.js';

const {
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLInt,
	GraphQLString,
	GraphQLList,
} = graphql;
const { S3_BUCKET } = process.env;

const RootQuery = new GraphQLObjectType({
	name: 'RootQueryType',
	fields: {
		getFile: {
			type: FileType,
			args: {
				storedName: { type: GraphQLString },
				name: { type: GraphQLString },
			},
			resolve(parent, args) {
				const { storedName, name } = args;
				const Expires = 60 * 5 * 1000; // in seconds
				const URL = s3.getSignedUrl('getObject', {
					Bucket: S3_BUCKET,
					Key: storedName,
					Expires,
					ResponseContentDisposition: `attachment; filename="${name}"`,
				});

				const storedNameSplit = storedName.split('.');
				const ext = storedNameSplit.pop();
				const thumbnailStoredName =
					storedNameSplit.join('.') + '_thumbnail.' + ext;

				const nameSplit = name.split('.');
				nameSplit.pop();
				const thumbnailName = nameSplit.join('.') + '_thumbnail.' + ext;
				const thumbnailURL = s3.getSignedUrl('getObject', {
					Bucket: S3_BUCKET,
					Key: thumbnailStoredName,
					Expires,
					ResponseContentDisposition: `attachment; filename="${thumbnailName}"`,
				});

				return {
					URL,
					thumbnailURL,
				};
			},
		},
	},
});

const graphQLSchema = new GraphQLSchema({
	query: RootQuery,
	// mutation: Mutation,
	// to create a graphql without a mutation, simply dont include it here
});
export default graphQLSchema;

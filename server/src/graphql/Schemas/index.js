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
				storedFileName: { type: GraphQLString },
				fileName: { type: GraphQLString },
			},
			resolve(parent, args) {
				const { storedFileName, fileName } = args;
				const Expires = 60 * 5 * 1000; // in seconds
				const ResponseContentDisposition = `attachment; filename="${fileName}"`;
				const URL = s3.getSignedUrl('getObject', {
					Bucket: S3_BUCKET,
					Key: storedFileName,
					Expires,
					ResponseContentDisposition,
				});

				return {
					URL,
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

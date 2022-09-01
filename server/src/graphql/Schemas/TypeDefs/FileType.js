import graphql from 'graphql';
const { GraphQLObjectType, GraphQLInt, GraphQLString } = graphql;

const FileType = new GraphQLObjectType({
	name: 'FileLink',
	fields: () => ({
		URL: { type: GraphQLString },
	}),
});

export default FileType;

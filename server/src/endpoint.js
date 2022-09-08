import { GraphQLClient } from 'graphql-request';

const { GRAPHQL_ENDPOINT } = process.env;

// maybe can pass in params for this to take the headers from the client and pass it into it if need be
const graphQLClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
	headers: req.headers, // spread headers received by expressjs, use that to complete the request
});

export {graphQLClient}
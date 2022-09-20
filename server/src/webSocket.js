import 'dotenv/config';
import ws, { WebSocketServer } from 'ws';
import { execute } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import gql from 'graphql-tag';
import { objectToGraphqlArgs } from 'hasura-args';

const { GRAPHQL_ENDPOINT_WS } = process.env;

const getWsClient = function (wsurl) {
	const client = new SubscriptionClient(
		wsurl,
		{
			reconnect: true,
			connectionParams: {
				headers: {
					// Authorization: 'Bearer xxxxx',
					'x-hasura-admin-secret': 'myadminsecretkey',
				},
			},
		},
		ws
	);
	return client;
};

const createSubscriptionObservable = (wsurl, query, variables) => {
	const link = new WebSocketLink(getWsClient(wsurl));
	return execute(link, { query: query, variables: variables });
};

const subscriptionClient = (subscriptionOf, args) => {
	const folderSubscriptionGraphql = gql`
		subscription {
			folder(${objectToGraphqlArgs(args)}) {
				id
				name
				meta {
					modified
					created
					lastAccessed
				}
			}
		}
	`;

	const fileSubscriptionGraphql = gql`
		subscription {
			file(${objectToGraphqlArgs(args)}) {
				id
				name
				size
				meta {
					modified
					created
					lastAccessed
				}
			}
		}
	`;

	const SUBSCRIBE_QUERY =
		subscriptionOf == 'File'
			? fileSubscriptionGraphql
			: folderSubscriptionGraphql;
	return createSubscriptionObservable(GRAPHQL_ENDPOINT_WS, SUBSCRIBE_QUERY);
};

export const webSocket = (server) => {
	const wss = new WebSocketServer({ server: server });

	wss.on('connection', (socket) => {
		console.log('a new client connected');
		let consumers = {};
		socket.on('message', (data) => {
			const { subscriptionOf, args } = JSON.parse(data);

			// console.log(args);

			// unsubscribe to old query if query has changed
			if (consumers[subscriptionOf]) {
				consumers[subscriptionOf].unsubscribe;
			}

			consumers[subscriptionOf] = subscriptionClient(
				subscriptionOf,
				args
			).subscribe(
				(data) => {
					// Do something on receipt of the event
					socket.send(
						JSON.stringify({
							subscriptionOf,
							data: data.data,
						})
					);
				},
				(err) => {
					console.log('Err');
					console.log(err);
				}
			);
		});

		socket.on('close', () => {
			console.log('client disconnected');
			Object.values(consumers).forEach((consumer) => {
				consumer.unsubscribe();
			});
		});
	});
};

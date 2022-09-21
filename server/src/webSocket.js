import 'dotenv/config';
import ws, { WebSocketServer } from 'ws';
import { execute } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import gql from 'graphql-tag';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';

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

const subscriptionClient = async (subscriptionOf, args) => {
	let SUBSCRIBE_QUERY;
	let newArgs;
	if (args == 'Shared with me') {
		const otherArgs = {
			where: { userId: { _eq: '123' } },
		};
		const query = gql`
            query {
                sharedWithMe(${objectToGraphqlArgs(otherArgs)}) {
                    collection
                }
            }
        `;

		const res = await graphQLClient.request(query);

		let _in;
		if (res.sharedWithMe.length != 0) {
			_in = JSON.parse(res.sharedWithMe[0].collection);
		} else {
			_in = [];
		}

		newArgs = {
			where: {
				_and: [
					{
						meta: {
							sharingPermission: {
								sharingPermissionLinks: { link: { _in } },
							},
						},
					},
					{ deleted: { _eq: false } },
				],
			},
		};
	} else {
		newArgs = args;
	}
	if (subscriptionOf == 'File') {
		SUBSCRIBE_QUERY = gql`
			subscription {
				file(${objectToGraphqlArgs(newArgs)}) {
					id
					name
					size
					meta {
						modified
						created
						lastAccessed
						sharingPermission {
							sharingPermissionLinks {
								link
							}
						}
					}
				}
			}
		`;
	} else if (subscriptionOf == 'Folder') {
		SUBSCRIBE_QUERY = gql`
			subscription {
				folder(${objectToGraphqlArgs(newArgs)}) {
					id
					name
					meta {
						modified
						created
						lastAccessed
						sharingPermission {
							sharingPermissionLinks {
								link
							}
						}
					}
				}
			}
		`;
	}
	return createSubscriptionObservable(GRAPHQL_ENDPOINT_WS, SUBSCRIBE_QUERY);
};

export const webSocket = (server) => {
	const wss = new WebSocketServer({ server: server });

	wss.on('connection', (socket) => {
		console.log('a new client connected');
		let consumers = {};
		socket.on('message', async (data) => {
			const { subscriptionOf, args } = JSON.parse(data);

			// console.log(args);

			// unsubscribe to old query if query has changed
			if (consumers[subscriptionOf]) {
				consumers[subscriptionOf].unsubscribe;
			}

			consumers[subscriptionOf] = (
				await subscriptionClient(subscriptionOf, args)
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

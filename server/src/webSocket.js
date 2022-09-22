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
		let consumers = [];
		socket.on('message', async (data) => {
			const { subscriptionOf, args, id } = JSON.parse(data);

			// add to list of consumers, so the most recent consumer will be what is returning a result to the frontend
			// stale queries wont conflict with new queries
			consumers.unshift({
				id,
				subscriptionOf,
			});
			const subscription = (
				await subscriptionClient(subscriptionOf, args)
			).subscribe(
				(eventData) => {
					// Do something on receipt of the event, if it is the most recent subscription of subscription of

					const mostRecent = consumers.find(
						(consumer) => consumer.subscriptionOf == subscriptionOf
					);
					if (mostRecent.id == id) {
						socket.send(JSON.stringify({ status: 200, data: eventData.data }));
						// console.log('sending data');
					}
				},
				(err) => {
					console.log('Err');
					console.log(err);
				}
			);

			const consumer = consumers.find((consumer) => consumer.id == id);
			consumer.subscription = subscription;

			const mostRecentFile = consumers.find(
				(consumer) => consumer.subscriptionOf == 'File'
			);
			const mostRecentFolder = consumers.find(
				(consumer) => consumer.subscriptionOf == 'Folder'
			);

			const toRemove = consumers.filter(
				(consumer) =>
					!(
						consumer.id == mostRecentFile?.id ||
						consumer.id == mostRecentFolder?.id
					)
			);
			consumers = consumers.filter(
				(consumer) =>
					consumer.id == mostRecentFile?.id ||
					consumer.id == mostRecentFolder?.id
			);

			toRemove.forEach((consumer) => {
				if (consumer.subscription.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});

			// console.log(consumers.length);
		});

		socket.on('close', () => {
			console.log('client disconnected');
			consumers.forEach((consumer) => {
				if (consumer.subscription.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});
		});
	});
};

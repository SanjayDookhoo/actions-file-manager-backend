import 'dotenv/config';
import ws, { WebSocketServer } from 'ws';
import { execute } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import gql from 'graphql-tag';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getRootFolderArgsAndAccessType, getUserId } from './utils';

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

const subscriptionClient = async ({ __typename, type, folderId, token }) => {
	const userId = getUserId({ token });

	if (type === 'itemList') {
		const { args, accessType } = await getRootFolderArgsAndAccessType({
			folderId,
			userId,
		});

		// if a folderId that is a integer is passed in, an actual folderId, accessType will always have a value
		// use this condition to know if to update a folders lastAccessed
		if (accessType) {
			await updateFolderLastAccessed(folderId);
		}

		const subscribeQuery = (__typename) => {
			return gql`
				subscription {
					${__typename}(${objectToGraphqlArgs(args)}) {
						id
						name
						meta {
							modified
							created
							lastAccessed
						}
						size
						${__typename === 'file' ? 'mimeType' : ''}
					}
				}
			`;
		};

		return {
			subscriptionObservable: createSubscriptionObservable(
				GRAPHQL_ENDPOINT_WS,
				subscribeQuery(__typename)
			),
			accessType,
		};
	} else if (type === 'aggregate' && folderId === 'Recycle bin') {
		const args = {
			where: { deletedInRootToUserId: { _eq: userId } },
		};

		const subscribeQuery = (__typename) => {
			return gql`
				subscription {
					${__typename}Aggregate(${objectToGraphqlArgs(args)}) {
						aggregate {
							count
						}
					}
				}
			`;
		};

		return {
			subscriptionObservable: createSubscriptionObservable(
				GRAPHQL_ENDPOINT_WS,
				subscribeQuery(__typename)
			),
		};
	} else if (
		type === 'size' &&
		folderId === 'Home' &&
		__typename === 'folder'
	) {
		const args = {
			where: { folderId: { _isNull: true }, meta: { userId: { _eq: userId } } },
		};

		const subscribeQuery = (__typename) => {
			return gql`
				subscription {
					${__typename}(${objectToGraphqlArgs(args)}) {
						size
						trashSize
					}
				}
			`;
		};

		return {
			subscriptionObservable: createSubscriptionObservable(
				GRAPHQL_ENDPOINT_WS,
				subscribeQuery(__typename)
			),
		};
	}
};

const updateFolderLastAccessed = async (id) => {
	// update lastAccessed
	const mutationArgs = {
		where: {
			folderId: { _eq: id },
		},
		_set: { lastAccessed: 'now()' },
	};
	const mutation = gql`
		mutation {
			updateMeta(${objectToGraphqlArgs(mutationArgs)}) {
				affected_rows
			}
		}
	`;
	await graphQLClient.request(mutation);
};

export const webSocket = (server) => {
	const wss = new WebSocketServer({ server: server });

	wss.on('connection', (socket) => {
		console.log('a new client connected');
		let consumers = [];
		socket.on('message', async (_data) => {
			const data = JSON.parse(_data);
			const { __typename, id, type } = data;

			// add to list of consumers, so the most recent consumer will be what is returning a result to the frontend
			// stale queries wont conflict with new queries
			consumers.unshift({
				id,
				__typename,
				type,
			});

			const { subscriptionObservable, accessType } = await subscriptionClient({
				...data,
			});

			const subscription = subscriptionObservable.subscribe(
				(eventData) => {
					// Do something on receipt of the event, if it is the most recent subscription of subscription of

					const mostRecent = consumers.find(
						(consumer) =>
							consumer.__typename === __typename && consumer.type === type
					);
					if (mostRecent.id === id) {
						socket.send(
							JSON.stringify({ status: 200, data: eventData.data, accessType })
						);
						// console.log('sending data', eventData.data);
					}
				},
				(err) => {
					console.log('Err');
					console.log(err);
				}
			);

			const consumer = consumers.find((consumer) => consumer.id === id);
			if (consumer) consumer.subscription = subscription;

			const mostRecent = consumers.find(
				(consumer) =>
					consumer.__typename === __typename && consumer.type === type
			);

			const toRemove = consumers.filter(
				(consumer) => !(consumer.id === mostRecent?.id)
			);

			// console.log(toRemove);

			consumers = consumers.filter(
				(consumer) => consumer.id === mostRecent?.id
			);

			toRemove.forEach((consumer) => {
				if (consumer?.subscription?.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});

			// console.log(consumers.length);
		});

		socket.on('close', () => {
			console.log('client disconnected');
			consumers.forEach((consumer) => {
				if (consumer?.subscription?.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});
		});
	});
};

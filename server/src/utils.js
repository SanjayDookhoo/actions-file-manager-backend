import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export const genericMeta = () => {
	return {
		userId: '123',
		sharingPermission: {
			sharingPermissionLinks: [
				{
					accessType: 'EDIT',
					link: uuidv4(),
				},
				{
					accessType: 'VIEW',
					link: uuidv4(),
				},
			],
		},
	};
};

export const getUserId = (req) => {
	const auth = req.headers.authorization;
	if (!auth) return null;

	const decoded = jwt.decode(auth.split(' ')[1]);
	return decoded['https://hasura.io/jwt/claims']['x-hasura-user-id']; // TODO, user needs to enter the path to the id
};

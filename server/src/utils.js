import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import _update from 'immutability-helper';

export const genericMeta = ({ req, userId }) => {
	return {
		userId: userId ? userId : getUserId({ req }),
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

export const getUserId = ({ req, token }) => {
	const auth = req?.headers?.authorization;
	if (!auth && !token) return null;

	const decoded = jwt.decode(token ? token : auth.split(' ')[1]);
	return decoded['https://hasura.io/jwt/claims']['x-hasura-user-id']; // TODO, user needs to enter the path to the id
};

export const update = _update; // does not allow vs code importing because it is not a named export, this makes it easier

export const capitalizeFirstLetter = (string) => {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

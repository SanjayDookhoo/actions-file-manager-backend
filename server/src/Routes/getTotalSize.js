import { getUserId } from '../utils.js';
import axios from 'axios';

const getTotalSize = async (req, res) => {
	const userId = getUserId({ req });
	const { USER_MAX_SIZE_CHECK } = process.env;
	const _userMaxSizeCheck = eval(USER_MAX_SIZE_CHECK);
	const userMaxSizeCheck = await _userMaxSizeCheck(userId, axios);

	res.json({ size: userMaxSizeCheck });
};

export default getTotalSize;

import { clipboard } from '..';

const cut = async (req, res) => {
	const { userId, selectedFolders, selectedFiles } = req.body;

	clipboard[userId] = {
		selectedFolders,
		selectedFiles,
		type: 'cut',
	};

	res.status(200).json({ message: 'Added to clipboard, cut' });
};

export default cut;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import remove from './Routes/remove.js';
import upload from './Routes/upload.js';
import { graphqlHTTP } from 'express-graphql';
import schema from './graphql/Schemas/index.js';
import createNewFolder from './Routes/createNewFolder.js';
import search from './Routes/search.js';
import paste from './Routes/paste.js';
import copy from './Routes/copy.js';
import cut from './Routes/cut.js';
import downloadFIle from './Routes/downloadFIle.js';
import rename from './Routes/rename.js';
import http from 'http';
import getFolderName from './Routes/getFolderName.js';
import { webSocket } from './webSocket.js';
import restore from './Routes/restore.js';
import permanentlyDelete from './Routes/permanentlyDelete.js';
import permanentlyDeleteFile from './Routes/permanentlyDeleteFile.js';
import addSharedWithMe from './Routes/addSharedWithMe.js';
import getSharingLinks from './Routes/getSharingLinks.js';
import refreshSharingLink from './Routes/refreshSharingLink.js';
import { overrideConsole } from 'nodejs-better-console';
import { ownerCheck, userEditCheck, userViewCheck } from './userCheck.js';

overrideConsole();

const { PORT } = process.env;

export const clipboard = {};

const app = express();
const server = http.createServer(app);
webSocket(server);

app.use(cors());
app.use(express.json());
app.use(
	'/graphql',
	graphqlHTTP({
		schema,
		// graphiql: true,
	})
); // https://www.youtube.com/watch?v=Dr2dDWzThK8

app.post('/upload', userEditCheck, upload);
app.post('/createNewFolder', userEditCheck, createNewFolder);
app.post('/cut', userEditCheck, cut);
app.post('/paste', userEditCheck, paste);
app.post('/rename', userEditCheck, rename);
app.post('/remove', userEditCheck, remove);
app.post('/search', userViewCheck, search);
app.post('/copy', userViewCheck, copy);
app.post('/downloadFile', userViewCheck, downloadFIle);
app.post('/getFolderName', userViewCheck, getFolderName);
app.post('/getSharingLinks', userViewCheck, getSharingLinks); // check if owner inside function, and return both if so, otherwise just return view
app.post('/restore', ownerCheck, restore);
app.post('/permanentlyDelete', ownerCheck, permanentlyDelete);
app.post('/refreshSharingLink', ownerCheck, refreshSharingLink);

app.post('/permanentlyDeleteFile', permanentlyDeleteFile); // checking inside file for a secret header

// shouldnt need a check
app.post('/addSharedWithMe', addSharedWithMe);

server.listen(PORT, () => {
	console.log(`Example app listening at http://localhost:${PORT}`);
});

import { graphQLClient } from "../endpoint";
import { genericMeta } from "../utils";
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from "graphql-request";

// because the newFolder has some meta assigned to it, it will be better to handle the entire folder creation on the backend
const search = async (req, res) => {
    const { search, folderId } = req.body;

    const recursiveFolderSearch = async (folderId, relativePath, relativePathName) => {
        let graphqlResponse
        let searchResponse = []

        // search all nested folders
        const nestedFolderQueryArguments = {
            where: {
                _and: {
                    parentFolderId: folderId ? {_eq: folderId} : {_isNull: true}
                }
            }
        }
        const nestedFolderQuery = gql`
            query {
                folder(${objectToGraphqlArgs(nestedFolderQueryArguments)}) {
                    id
                    name
                }
            }
        `;
        graphqlResponse = await graphQLClient.request(nestedFolderQuery)
        for(const folder of graphqlResponse.folder){
            searchResponse = [...searchResponse, ...(await recursiveFolderSearch(folder.id, [...relativePath, folder.id], [...relativePathName, folder.name]))]
        }

        /**
         * if search is 'test   5'
         * the search is looking for a folder or file that matches EITHER 'test' or '5' in it because it is seperated by whitespaces
         * considering the case of 'tes', if the name is 'now test' or 'test now', both is valid, as long as it starts with the search term, or anywhere with a space is followed by the search term
         *  */ 
        const orCondition = []
        const splitSearch = search.split(' ').filter(el => el != '') // ie '1   6  5' becomes ['1', '6', '5']
        splitSearch.forEach(search => {
            // starts with search 
            orCondition.push(
                {name: {_ilike: `${search}%`}}
            ) 
            // search is somewhere else, but begins with at least one space
            orCondition.push(
                {name: {_ilike: `% ${search}%`}}
            ) 
        })

        // all folders that match the search query
        const folderQueryArguments = {
            where: {
                _and: {
                    _or: orCondition,
                    parentFolderId: folderId ? {_eq: folderId} : {_isNull: true}
                }
            }
        }
        const folderQuery = gql`
            query {
                folder(${objectToGraphqlArgs(folderQueryArguments)}) {
                    id
                    name
                }
            }
        `;

        graphqlResponse = await graphQLClient.request(folderQuery)
        searchResponse = [...searchResponse, ...graphqlResponse.folder.map(folder => ({...folder, relativePath, relativePathName, __typename: 'Folder'}))]

        // all files that match the search query
        const fileQueryArguments = {
            where: {
                _and: {
                    _or: orCondition,
                    folderId: folderId ? {_eq: folderId} : {_isNull: true}
                }
            }
        }
        const fileQuery = gql`
            query {
                file(${objectToGraphqlArgs(fileQueryArguments)}) {
                    id
                    name
                }
            }
        `;
        graphqlResponse = await graphQLClient.request(fileQuery)
        searchResponse = [...searchResponse, ...graphqlResponse.file.map(file => ({...file, relativePath, relativePathName,__typename: 'File'}))]
        
        return searchResponse
    }

    const searchResponse = await recursiveFolderSearch(folderId, [], [])
    res.json(searchResponse)
}

export default search
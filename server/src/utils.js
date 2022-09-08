import { v4 as uuidv4 } from 'uuid';

export const genericMeta = () => {
    return {
        userId: "123",
        sharingPermission: {
          sharingPermissionLinks:[
            {
              accessType: 'EDIT',
              link: uuidv4()
            },
            {
              accessType: 'VIEW',
              link: uuidv4()
            },
          ]
        }
    }
    
}
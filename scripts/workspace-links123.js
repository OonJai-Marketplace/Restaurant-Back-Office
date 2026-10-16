/* Open the customer-facing restaurant from the administrator's workspace. */
(()=>{'use strict';window.restaurantWorkspace123={publicSite(){
 if(liveProfile?.role!=='admin')return;
 const tab=window.open(OJM_RESTAURANT_APPS.public,'_blank','noopener,noreferrer');
 if(tab)tab.opener=null;
}};})();

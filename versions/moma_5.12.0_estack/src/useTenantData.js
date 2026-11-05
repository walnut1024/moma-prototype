import {useEffect,useState} from 'react';
import {tenantData} from './tenant-data.mjs';
import {LINK_EVENT} from './service-access.mjs';
const read=()=>{try{return tenantData();}catch(error){return {keys:[],routes:[],orders:[],plans:[],services:[],projects:[],requests:[],models:[],organization:{departments:[],members:[],audit:[]},error:error.message};}};
export function useTenantData(){const [data,setData]=useState(read);useEffect(()=>{const update=()=>setData(read());for(const event of [LINK_EVENT,'storage','focus'])window.addEventListener(event,update);return()=>{for(const event of [LINK_EVENT,'storage','focus'])window.removeEventListener(event,update);};},[]);return {...data,reload:()=>setData(read())};}

const API = "homeassistant-api.dan-hunziker73.workers.dev";
async function getStates() {
  const res = await fetch(API + "/states");
  return await res.json();
}

const response =
await fetch(
HA_URL+"/api/states",
{

headers:
{
"Authorization":
"Bearer "+TOKEN,

"Content-Type":
"application/json"

}

});


return await response.json();

}





function findEntity(states,id){


return states.find(
x=>x.entity_id===id
);

}





async function load(){


let states =
await getStates();



// Haus


let light =
findEntity(
states,
"light.wohnzimmer"
);



document.getElementById("house")
.innerHTML = `


<div class="item">

<span>Licht Wohnzimmer</span>

<span class="${light?.state}">
${light?.state || "nicht gefunden"}

</span>

</div>


`;





// Proxmox


let cpu =
findEntity(
states,
"sensor.proxmox_cpu"
);



document.getElementById("server")
.innerHTML = `


<div class="item">

CPU

<span>

${cpu?.state || "--"} %

</span>

</div>


<div class="item">

Status

<span class="ok">

Online

</span>

</div>


`;





// Container


document.getElementById("containers")
.innerHTML = `


<div class="item">

Immich

<span class="ok">

🟢

</span>

</div>


<div class="item">

Stirling PDF

<span class="ok">

🟢

</span>

</div>


`;



}



load();


setInterval(load,10000);

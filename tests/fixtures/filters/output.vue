<template>
  <div>{{concat(uppercase(hello), other)}}</div>
</template>

<script setup lang="ts">
import { ref } from "vue"

const hello = ref("hello")
const other = ref(1)

function concat(a0, a1) {
  return a0 + a1
}
function uppercase(v) {
  return v.toUpperCase()
}
</script>

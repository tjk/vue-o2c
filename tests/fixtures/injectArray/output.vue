<script setup lang="ts">
import { inject } from "vue"

const $injectSomething = inject("injectSomething")

console.log("injected:", $injectSomething)
</script>
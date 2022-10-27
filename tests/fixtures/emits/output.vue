<script setup lang="ts">
import { onBeforeMount } from "vue"

const $emit = defineEmits(["specifiedButNotUsed", "usedButNotSpecfied"])

onBeforeMount(() => {
  $emit("usedButNotSpecfied")
})
</script>

<script setup lang="ts">
const $emit = defineEmits(["specifiedButNotUsed", "usedButNotSpecfied"])

$emit("usedButNotSpecfied")
</script>

document.addEventListener('DOMContentLoaded', function () {
  var copyButtons = document.querySelectorAll('.btn-copy');
  var toast = document.getElementById('toast');

  copyButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var textToCopy = btn.getAttribute('data-copy');
      if (!textToCopy) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(showToast);
      } else {
        var textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast();
      }
    });
  });

  function showToast() {
    if (!toast) return;
    toast.classList.add('is-show');
    setTimeout(function () {
      toast.classList.remove('is-show');
    }, 2000);
  }
});
